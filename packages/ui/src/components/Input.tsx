import * as React from 'react';

/**
 * Input Component
 *
 * A polished input component with clean borders, focus states, and error handling.
 * Designed for consistency across the application.
 *
 * Features:
 * - Clean borders with focus states (primary color ring)
 * - Error states with red border and message
 * - Size variants (sm, md, lg)
 * - Left/right addon support (icons, text)
 * - Disabled state
 */

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Error message to display */
  error?: string;
  /** Left addon (icon or text) */
  leftAddon?: React.ReactNode;
  /** Right addon (icon or text) */
  rightAddon?: React.ReactNode;
  /** Full width */
  fullWidth?: boolean;
  /** Wrapper className */
  wrapperClassName?: string;
}

const sizeStyles = {
  sm: 'h-7 px-2.5 text-sm',
  md: 'h-9 px-3 text-sm',
  lg: 'h-11 px-4 text-base',
};

const addonSizeStyles = {
  sm: 'px-2',
  md: 'px-3',
  lg: 'px-4',
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className = '',
      size = 'md',
      error,
      leftAddon,
      rightAddon,
      fullWidth = false,
      wrapperClassName = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const hasError = Boolean(error);

    const baseInputStyles = [
      // Base
      'bg-[var(--color-input-bg)]',
      'text-[var(--color-text)]',
      'placeholder:text-[var(--color-text-tertiary)]',
      // Border
      hasError
        ? 'border border-[var(--color-error-500)] focus:border-[var(--color-error-500)]'
        : 'border border-[var(--color-input-border)] focus:border-[var(--color-border-focus)]',
      // Focus
      'focus:outline-none',
      hasError
        ? 'focus:ring-2 focus:ring-[var(--color-error-200)] dark:focus:ring-[var(--color-error-900)]'
        : 'focus:ring-2 focus:ring-[var(--color-input-focus-ring)]',
      // Rounded
      leftAddon ? 'rounded-r-md' : rightAddon ? 'rounded-l-md' : 'rounded-md',
      // Size
      sizeStyles[size],
      // Width
      fullWidth || leftAddon || rightAddon ? 'w-full' : '',
      // Transitions
      'transition-colors duration-[var(--duration-fast)]',
      // Disabled
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-bg-secondary)]',
      // Custom
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const addonStyles = [
      'flex items-center',
      'bg-[var(--color-bg-secondary)] dark:bg-[var(--color-surface)]',
      'text-[var(--color-text-secondary)]',
      'border border-[var(--color-input-border)]',
      addonSizeStyles[size],
    ].join(' ');

    if (leftAddon || rightAddon) {
      return (
        <div className={`${fullWidth ? 'w-full' : ''} ${wrapperClassName}`}>
          <div className="flex">
            {leftAddon && (
              <span className={`${addonStyles} rounded-l-md border-r-0`}>
                {leftAddon}
              </span>
            )}
            <input
              ref={ref}
              className={baseInputStyles}
              disabled={disabled}
              aria-invalid={hasError}
              aria-describedby={error ? `${props.id}-error` : undefined}
              {...props}
            />
            {rightAddon && (
              <span className={`${addonStyles} rounded-r-md border-l-0`}>
                {rightAddon}
              </span>
            )}
          </div>
          {error && (
            <p
              id={`${props.id}-error`}
              className="mt-1.5 text-xs text-[var(--color-error-500)] dark:text-[var(--color-error-400)]"
            >
              {error}
            </p>
          )}
        </div>
      );
    }

    return (
      <div className={`${fullWidth ? 'w-full' : ''} ${wrapperClassName}`}>
        <input
          ref={ref}
          className={baseInputStyles}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={error ? `${props.id}-error` : undefined}
          {...props}
        />
        {error && (
          <p
            id={`${props.id}-error`}
            className="mt-1.5 text-xs text-[var(--color-error-500)] dark:text-[var(--color-error-400)]"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

/**
 * Textarea Component
 *
 * A polished textarea component matching the Input styling.
 */

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Size variant (affects padding and font size) */
  size?: 'sm' | 'md' | 'lg';
  /** Error message to display */
  error?: string;
  /** Full width */
  fullWidth?: boolean;
  /** Wrapper className */
  wrapperClassName?: string;
}

const textareaSizeStyles = {
  sm: 'px-2.5 py-1.5 text-sm',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-3 text-base',
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className = '',
      size = 'md',
      error,
      fullWidth = false,
      wrapperClassName = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const hasError = Boolean(error);

    const baseTextareaStyles = [
      // Base
      'bg-[var(--color-input-bg)]',
      'text-[var(--color-text)]',
      'placeholder:text-[var(--color-text-tertiary)]',
      // Border
      hasError
        ? 'border border-[var(--color-error-500)] focus:border-[var(--color-error-500)]'
        : 'border border-[var(--color-input-border)] focus:border-[var(--color-border-focus)]',
      // Focus
      'focus:outline-none',
      hasError
        ? 'focus:ring-2 focus:ring-[var(--color-error-200)] dark:focus:ring-[var(--color-error-900)]'
        : 'focus:ring-2 focus:ring-[var(--color-input-focus-ring)]',
      // Rounded
      'rounded-md',
      // Size
      textareaSizeStyles[size],
      // Width
      fullWidth ? 'w-full' : '',
      // Resize
      'resize-y min-h-[80px]',
      // Transitions
      'transition-colors duration-[var(--duration-fast)]',
      // Disabled
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-bg-secondary)]',
      // Custom
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={`${fullWidth ? 'w-full' : ''} ${wrapperClassName}`}>
        <textarea
          ref={ref}
          className={baseTextareaStyles}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={error ? `${props.id}-error` : undefined}
          {...props}
        />
        {error && (
          <p
            id={`${props.id}-error`}
            className="mt-1.5 text-xs text-[var(--color-error-500)] dark:text-[var(--color-error-400)]"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

/**
 * Label Component
 *
 * A simple label component for form fields.
 */

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** Required indicator */
  required?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className = '', required, children, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={`block text-sm font-medium text-[var(--color-text)] mb-1.5 ${className}`}
        {...props}
      >
        {children}
        {required && (
          <span className="text-[var(--color-error-500)] ml-0.5">*</span>
        )}
      </label>
    );
  }
);

Label.displayName = 'Label';

export default Input;
