import * as React from 'react';
import {
  FileText,
  ListTodo,
  Users,
  MessageSquare,
  FolderOpen,
  Target,
  Workflow,
  Inbox,
  Search,
  Plus,
} from 'lucide-react';

/**
 * EmptyState Component (TB157)
 *
 * A consistent, responsive empty state display for when lists or views have no data.
 * Features:
 * - Contextual icon based on element type
 * - Title and description
 * - Optional action button
 * - Fully responsive sizing (mobile-first)
 * - Touch-friendly action button (44px+ touch targets)
 */

export interface EmptyStateProps {
  /** The type of element/context for appropriate icon */
  type?: 'tasks' | 'entities' | 'teams' | 'documents' | 'messages' | 'plans' | 'workflows' | 'inbox' | 'search' | 'generic';
  /** Main heading */
  title: string;
  /** Description text */
  description?: string;
  /** Custom icon override */
  icon?: React.ReactNode;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Size variant for different contexts */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
}

const TYPE_ICONS: Record<NonNullable<EmptyStateProps['type']>, typeof FileText> = {
  tasks: ListTodo,
  entities: Users,
  teams: Users,
  documents: FileText,
  messages: MessageSquare,
  plans: Target,
  workflows: Workflow,
  inbox: Inbox,
  search: Search,
  generic: FolderOpen,
};

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      type = 'generic',
      title,
      description,
      icon,
      action,
      size = 'md',
      className = '',
    },
    ref
  ) => {
    const IconComponent = TYPE_ICONS[type];

    // Size-based classes
    const sizeClasses = {
      sm: {
        container: 'px-4 py-6 sm:px-6 sm:py-8',
        iconContainer: 'w-10 h-10 sm:w-12 sm:h-12 mb-3',
        icon: 'w-5 h-5 sm:w-6 sm:h-6',
        title: 'text-sm sm:text-base font-medium mb-1.5',
        description: 'text-xs sm:text-sm max-w-[280px] sm:max-w-sm mb-4',
        button: 'px-3 py-2 text-xs sm:text-sm min-h-[36px] sm:min-h-[40px]',
        buttonIcon: 'w-3.5 h-3.5 sm:w-4 sm:h-4',
      },
      md: {
        container: 'px-4 py-8 sm:px-6 sm:py-12',
        iconContainer: 'w-12 h-12 sm:w-16 sm:h-16 mb-3 sm:mb-4',
        icon: 'w-6 h-6 sm:w-8 sm:h-8',
        title: 'text-base sm:text-lg font-medium mb-1.5 sm:mb-2',
        description: 'text-sm max-w-[280px] sm:max-w-sm mb-4 sm:mb-6',
        button: 'px-4 py-2.5 text-sm min-h-[44px]',
        buttonIcon: 'w-4 h-4',
      },
      lg: {
        container: 'px-6 py-12 sm:px-8 sm:py-16',
        iconContainer: 'w-16 h-16 sm:w-20 sm:h-20 mb-4 sm:mb-6',
        icon: 'w-8 h-8 sm:w-10 sm:h-10',
        title: 'text-lg sm:text-xl font-medium mb-2 sm:mb-3',
        description: 'text-sm sm:text-base max-w-[300px] sm:max-w-md mb-6 sm:mb-8',
        button: 'px-5 py-3 text-sm sm:text-base min-h-[48px]',
        buttonIcon: 'w-4 h-4 sm:w-5 sm:h-5',
      },
    };

    const classes = sizeClasses[size];

    return (
      <div
        ref={ref}
        className={[
          'flex flex-col items-center justify-center',
          classes.container,
          'text-center',
          className,
        ].join(' ')}
        data-testid="empty-state"
        data-size={size}
      >
        {/* Icon */}
        <div
          className={[
            'rounded-full bg-[var(--color-surface-active)] flex items-center justify-center',
            classes.iconContainer,
          ].join(' ')}
          data-testid="empty-state-icon"
        >
          {icon || <IconComponent className={`${classes.icon} text-[var(--color-text-tertiary)]`} />}
        </div>

        {/* Title */}
        <h3
          className={`${classes.title} text-[var(--color-text)]`}
          data-testid="empty-state-title"
        >
          {title}
        </h3>

        {/* Description */}
        {description && (
          <p
            className={`${classes.description} text-[var(--color-text-secondary)]`}
            data-testid="empty-state-description"
          >
            {description}
          </p>
        )}

        {/* Action Button - touch-friendly with 44px+ height */}
        {action && (
          <button
            onClick={action.onClick}
            className={[
              'inline-flex items-center justify-center gap-2',
              classes.button,
              'font-medium',
              'text-[var(--color-text-inverted)]',
              'bg-[var(--color-primary)]',
              'hover:bg-[var(--color-primary-hover)]',
              'active:bg-[var(--color-primary-active)]',
              'rounded-lg',
              'transition-colors duration-[var(--duration-fast)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] focus:ring-offset-2',
              // Full width on very small screens, auto width otherwise
              'w-full xs:w-auto max-w-[280px]',
            ].join(' ')}
            data-testid="empty-state-action"
          >
            <Plus className={classes.buttonIcon} />
            {action.label}
          </button>
        )}
      </div>
    );
  }
);

EmptyState.displayName = 'EmptyState';

export default EmptyState;
