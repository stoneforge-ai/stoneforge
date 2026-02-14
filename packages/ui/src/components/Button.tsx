import * as React from 'react';

/**
 * Button Component
 *
 * A polished button component with multiple variants, sizes, and states.
 * Designed for accessibility with proper focus states and keyboard support.
 *
 * Variants:
 * - primary: Blue background, white text - for primary actions
 * - secondary: Gray background, dark text - for secondary actions
 * - ghost: Transparent background, hover state - for subtle actions
 * - danger: Red colors - for destructive actions
 * - outline: Border only, no background - for less prominent actions
 *
 * Sizes:
 * - xs: Extra small (24px height)
 * - sm: Small (28px height)
 * - md: Medium (36px height) - default
 * - lg: Large (44px height)
 *
 * Features:
 * - Subtle hover states with background color shift
 * - Active states with slight scale (0.98)
 * - Focus rings for accessibility
 * - Loading state with spinner
 * - Icon support (left/right)
 */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles = {
  primary: [
    // Light mode
    'bg-[var(--color-primary)] text-white',
    'hover:bg-[var(--color-primary-hover)]',
    'active:bg-[var(--color-primary-active)]',
    'focus-visible:ring-2 focus-visible:ring-[var(--color-primary-200)] focus-visible:ring-offset-2',
    // Dark mode adjustments
    'dark:focus-visible:ring-[var(--color-primary-800)]',
    // Disabled
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
  ].join(' '),

  secondary: [
    // Light mode
    'bg-[var(--color-neutral-100)] text-[var(--color-text)]',
    'hover:bg-[var(--color-neutral-200)]',
    'active:bg-[var(--color-neutral-300)]',
    'focus-visible:ring-2 focus-visible:ring-[var(--color-neutral-400)] focus-visible:ring-offset-2',
    // Dark mode
    'dark:bg-[var(--color-surface)] dark:text-[var(--color-text)]',
    'dark:hover:bg-[var(--color-surface-hover)]',
    'dark:active:bg-[var(--color-surface-active)]',
    'dark:focus-visible:ring-[var(--color-neutral-600)]',
    // Disabled
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
  ].join(' '),

  ghost: [
    // Light mode
    'bg-transparent text-[var(--color-text-secondary)]',
    'hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-text)]',
    'active:bg-[var(--color-neutral-200)]',
    'focus-visible:ring-2 focus-visible:ring-[var(--color-neutral-400)] focus-visible:ring-offset-2',
    // Dark mode
    'dark:text-[var(--color-text-secondary)]',
    'dark:hover:bg-[var(--color-surface-hover)] dark:hover:text-[var(--color-text)]',
    'dark:active:bg-[var(--color-surface-active)]',
    'dark:focus-visible:ring-[var(--color-neutral-600)]',
    // Disabled
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
  ].join(' '),

  danger: [
    // Light mode
    'bg-[var(--color-danger)] text-white',
    'hover:bg-[var(--color-danger-hover)]',
    'active:bg-[var(--color-error-700)]',
    'focus-visible:ring-2 focus-visible:ring-[var(--color-error-200)] focus-visible:ring-offset-2',
    // Dark mode
    'dark:focus-visible:ring-[var(--color-error-900)]',
    // Disabled
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
  ].join(' '),

  outline: [
    // Light mode
    'bg-transparent border border-[var(--color-border)] text-[var(--color-text)]',
    'hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-neutral-400)]',
    'active:bg-[var(--color-surface-active)]',
    'focus-visible:ring-2 focus-visible:ring-[var(--color-primary-200)] focus-visible:ring-offset-2',
    // Dark mode
    'dark:border-[var(--color-border)] dark:text-[var(--color-text)]',
    'dark:hover:bg-[var(--color-surface-hover)] dark:hover:border-[var(--color-neutral-600)]',
    'dark:active:bg-[var(--color-surface-active)]',
    'dark:focus-visible:ring-[var(--color-primary-800)]',
    // Disabled
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
  ].join(' '),
};

const sizeStyles = {
  xs: 'h-6 px-2 text-xs gap-1 rounded',
  sm: 'h-7 px-2.5 text-sm gap-1.5 rounded-md',
  md: 'h-9 px-4 text-sm gap-2 rounded-md',
  lg: 'h-11 px-6 text-base gap-2 rounded-lg',
};

const iconOnlySizeStyles = {
  xs: 'h-6 w-6 p-0',
  sm: 'h-7 w-7 p-0',
  md: 'h-9 w-9 p-0',
  lg: 'h-11 w-11 p-0',
};

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isIconOnly = !children && (leftIcon || rightIcon) && !(leftIcon && rightIcon);

    const baseStyles = [
      // Base layout
      'inline-flex items-center justify-center',
      // Typography
      'font-medium',
      // Transitions
      'transition-all duration-[var(--duration-fast)]',
      // Active scale effect
      'active:scale-[0.98]',
      // Full width
      fullWidth ? 'w-full' : '',
      // Size - use icon-only sizing if applicable
      isIconOnly ? iconOnlySizeStyles[size] : sizeStyles[size],
      // Variant
      variantStyles[variant],
      // Custom className
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const spinnerSize = size === 'xs' || size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

    return (
      <button
        ref={ref}
        className={baseStyles}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <Spinner className={spinnerSize} />
            {children && <span className="opacity-0">{children}</span>}
          </>
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
