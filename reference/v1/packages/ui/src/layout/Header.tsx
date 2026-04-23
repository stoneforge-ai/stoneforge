/**
 * Header - Configurable application header
 *
 * Provides a flexible header with slots for:
 * - Breadcrumbs or navigation on the left
 * - App-specific controls on the right
 * - Dividers between sections
 *
 * This component is primarily used within AppShell, but can be used standalone.
 */

import { type ReactNode, type ComponentType } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Breadcrumb item for navigation
 */
export interface BreadcrumbItem {
  /** Display label */
  label: string;
  /** Route path (undefined for current page) */
  path?: string;
  /** Optional icon */
  icon?: ComponentType<{ className?: string }>;
  /** Whether this is the last item (current page) */
  isLast?: boolean;
}

export interface BreadcrumbsProps {
  /** Breadcrumb items to display */
  items: BreadcrumbItem[];
  /** Custom link component (for router integration) */
  LinkComponent: ComponentType<{
    to: string;
    children: ReactNode;
    className?: string;
    'data-testid'?: string;
  }>;
  /** Test ID prefix */
  testId?: string;
}

/**
 * Breadcrumbs component for navigation hierarchy display
 */
export function Breadcrumbs({ items, LinkComponent, testId = 'breadcrumbs' }: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" data-testid={testId}>
      <ol className="flex items-center gap-1 text-sm">
        {items.map((crumb, index) => {
          const Icon = crumb.icon;
          const isLast = crumb.isLast ?? index === items.length - 1;
          const testIdSuffix = crumb.label.toLowerCase().replace(/\s/g, '-');

          return (
            <li key={crumb.path ?? crumb.label} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="w-4 h-4 mx-1 text-[var(--color-text-muted)]" />
              )}
              {isLast || !crumb.path ? (
                <span
                  className="flex items-center gap-1.5 px-2 py-1 font-semibold text-[var(--color-text)] rounded-md"
                  data-testid={`${testId}-${testIdSuffix}`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {crumb.label}
                </span>
              ) : (
                <LinkComponent
                  to={crumb.path}
                  className="flex items-center gap-1.5 px-2 py-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors duration-150"
                  data-testid={`${testId}-${testIdSuffix}`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {crumb.label}
                </LinkComponent>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Mobile-optimized breadcrumbs showing only the current page
 */
export function BreadcrumbsMobile({ items, testId = 'breadcrumbs-mobile' }: Omit<BreadcrumbsProps, 'LinkComponent'>) {
  const lastCrumb = items[items.length - 1];

  if (!lastCrumb) {
    return null;
  }

  const Icon = lastCrumb.icon;

  return (
    <div
      className="flex items-center justify-center gap-1.5 text-sm font-semibold text-[var(--color-text)]"
      data-testid={testId}
    >
      {Icon && <Icon className="w-4 h-4" />}
      <span className="truncate max-w-[150px]">{lastCrumb.label}</span>
    </div>
  );
}

export interface HeaderProps {
  /** Left side content (typically breadcrumbs) */
  left?: ReactNode;
  /** Right side content (theme toggle, notifications, etc.) */
  right?: ReactNode;
  /** Center content (mobile title) */
  center?: ReactNode;
  /** Additional className */
  className?: string;
  /** Test ID */
  testId?: string;
}

/**
 * Header component with flexible slots
 */
export function Header({
  left,
  right,
  center,
  className = '',
  testId = 'header',
}: HeaderProps) {
  return (
    <header
      className={`flex items-center justify-between h-14 px-4 md:px-6 bg-[var(--color-header-bg)] border-b border-[var(--color-header-border)] ${className}`}
      data-testid={testId}
    >
      {left && <div className="flex items-center">{left}</div>}
      {center && <div className="flex-1 flex justify-center">{center}</div>}
      {right && <div className="flex items-center gap-2 md:gap-4">{right}</div>}
    </header>
  );
}

export interface ConnectionStatusProps {
  /** Connection state */
  state: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'polling' | 'error';
  /** Custom label override */
  label?: string;
}

/**
 * Connection status indicator for header
 */
export function ConnectionStatus({ state, label }: ConnectionStatusProps) {
  const stateConfig = {
    connecting: {
      color: 'var(--color-warning)',
      textColor: 'var(--color-warning-text)',
      label: 'Connecting...',
      pulse: true,
    },
    connected: {
      color: 'var(--color-success)',
      textColor: 'var(--color-success-text)',
      label: 'Live',
      pulse: false,
    },
    disconnected: {
      color: 'var(--color-danger)',
      textColor: 'var(--color-danger-text)',
      label: 'Disconnected',
      pulse: false,
    },
    reconnecting: {
      color: 'var(--color-warning)',
      textColor: 'var(--color-warning-text)',
      label: 'Reconnecting...',
      pulse: true,
    },
    polling: {
      color: 'var(--color-warning)',
      textColor: 'var(--color-warning-text)',
      label: 'Polling',
      pulse: false,
    },
    error: {
      color: 'var(--color-danger)',
      textColor: 'var(--color-danger-text)',
      label: 'Error',
      pulse: false,
    },
  };

  const config = stateConfig[state];

  return (
    <div className="flex items-center gap-2" style={{ color: config.textColor }}>
      <div
        className={`w-2 h-2 rounded-full ${config.pulse ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: config.color }}
      />
      <span className="text-sm font-medium">{label ?? config.label}</span>
    </div>
  );
}

/**
 * Divider component for header sections
 */
export function HeaderDivider() {
  return <div className="h-5 w-px bg-[var(--color-border)]" />;
}
