/**
 * PageHeader - Standardized page header component
 *
 * Provides consistent styling across all pages:
 * - Title with optional icon
 * - Optional count display
 * - Optional subtitle/description
 * - Optional action buttons (create, etc.)
 * - Responsive mobile/desktop layouts
 * - Optional bordered wrapper with background
 */

import { type LucideIcon } from 'lucide-react';
import { useIsMobile } from '../../hooks';

export interface PageHeaderAction {
  label: string;
  shortLabel?: string; // Shorter label for mobile
  icon?: LucideIcon;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  shortcut?: string; // Keyboard shortcut hint
  testId?: string;
}

export interface PageHeaderProps {
  /** Page title */
  title: string;
  /** Optional icon to display before title */
  icon?: LucideIcon;
  /** Icon color class (e.g., 'text-blue-500') */
  iconColor?: string;
  /** Optional count to display after title */
  count?: number;
  /** Optional total count for "X of Y" display */
  totalCount?: number;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Action buttons (create, etc.) */
  actions?: PageHeaderAction[];
  /** Children rendered below the title row */
  children?: React.ReactNode;
  /** Test ID for the header */
  testId?: string;
  /** Add border and background wrapper (for list pages) */
  bordered?: boolean;
  /** Custom class name for additional styling */
  className?: string;
}

export function PageHeader({
  title,
  icon: Icon,
  iconColor = 'text-blue-500',
  count,
  totalCount,
  subtitle,
  actions = [],
  children,
  testId,
  bordered = false,
  className = '',
}: PageHeaderProps) {
  const isMobile = useIsMobile();

  const renderCount = () => {
    if (count === undefined) return null;

    if (totalCount !== undefined && totalCount !== count) {
      return (
        <span className="text-sm text-[var(--color-text-secondary)]">
          {count} of {totalCount}
        </span>
      );
    }

    return (
      <span className="text-sm text-[var(--color-text-secondary)]">
        ({count})
      </span>
    );
  };

  const renderActions = () => {
    if (actions.length === 0) return null;

    return (
      <div className="flex items-center gap-2">
        {actions.map((action, index) => {
          const ActionIcon = action.icon;
          const isPrimary = action.variant !== 'secondary';

          return (
            <button
              key={index}
              onClick={action.onClick}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors touch-target ${
                isPrimary
                  ? 'text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]'
                  : 'text-[var(--color-text)] bg-[var(--color-surface-hover)] hover:bg-[var(--color-border)]'
              }`}
              data-testid={action.testId}
            >
              {ActionIcon && <ActionIcon className="w-4 h-4" />}
              <span className={isMobile && action.shortLabel ? 'hidden sm:inline' : ''}>
                {action.label}
              </span>
              {isMobile && action.shortLabel && (
                <span className="sm:hidden">{action.shortLabel}</span>
              )}
              {action.shortcut && !isMobile && (
                <kbd className="ml-1 text-xs bg-[var(--color-primary-700)]/50 text-white px-1 py-0.5 rounded">
                  {action.shortcut}
                </kbd>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  // Wrapper classes depend on whether we want bordered style
  const wrapperClasses = bordered
    ? `border-b border-[var(--color-border)] bg-[var(--color-surface)] ${isMobile ? 'p-3' : 'p-4'} ${className}`
    : `mb-4 sm:mb-6 ${className}`;

  return (
    <div data-testid={testId} className={wrapperClasses}>
      {/* Title row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${iconColor} flex-shrink-0`} />
          )}
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold text-[var(--color-text)] truncate">
              {title}
            </h1>
            {!isMobile && renderCount()}
          </div>
        </div>
        {renderActions()}
      </div>

      {/* Mobile count - shown below title */}
      {isMobile && (count !== undefined) && (
        <div className="mt-1">
          {renderCount()}
        </div>
      )}

      {/* Subtitle */}
      {subtitle && (
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {subtitle}
        </p>
      )}

      {/* Additional content (filters, search, etc.) */}
      {children && (
        <div className={bordered ? 'mt-3' : 'mt-3 sm:mt-4'}>
          {children}
        </div>
      )}
    </div>
  );
}
