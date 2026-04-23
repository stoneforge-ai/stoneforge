import * as React from 'react';

/**
 * Badge Component
 *
 * A small label component for displaying status, categories, or counts.
 *
 * Variants:
 * - default: Gray background - for neutral information
 * - primary: Blue colors - for primary items
 * - success: Green colors - for positive status
 * - warning: Yellow/amber colors - for warning status
 * - error: Red colors - for error status
 * - outline: Border only - for less prominent badges
 */

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'outline';
  size?: 'sm' | 'md';
}

const variantStyles = {
  default: [
    'bg-[var(--color-neutral-100)] text-[var(--color-text-secondary)]',
    'dark:bg-[var(--color-surface)] dark:text-[var(--color-text-secondary)]',
  ].join(' '),

  primary: [
    'bg-[var(--color-primary-muted)] text-[var(--color-primary-text)]',
    'dark:bg-[var(--color-primary-muted)] dark:text-[var(--color-primary)]',
  ].join(' '),

  success: [
    'bg-[var(--color-success-bg)] text-[var(--color-success-700)]',
    'dark:bg-[var(--color-success-bg)] dark:text-[var(--color-success-text)]',
  ].join(' '),

  warning: [
    'bg-[var(--color-warning-bg)] text-[var(--color-warning-700)]',
    'dark:bg-[var(--color-warning-bg)] dark:text-[var(--color-warning-text)]',
  ].join(' '),

  error: [
    'bg-[var(--color-danger-bg)] text-[var(--color-error-700)]',
    'dark:bg-[var(--color-danger-bg)] dark:text-[var(--color-danger-text)]',
  ].join(' '),

  outline: [
    'bg-transparent border border-[var(--color-border)] text-[var(--color-text-secondary)]',
    'dark:border-[var(--color-border)] dark:text-[var(--color-text-secondary)]',
  ].join(' '),
};

const sizeStyles = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = '', variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={[
          // Base
          'inline-flex items-center',
          'font-medium',
          'rounded-md',
          'whitespace-nowrap',
          // Variant
          variantStyles[variant],
          // Size
          sizeStyles[size],
          // Custom
          className,
        ].join(' ')}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';

export default Badge;
