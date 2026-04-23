import * as React from 'react';

/**
 * Card Component
 *
 * A container component for grouping related content.
 *
 * Variants:
 * - default: Subtle border, flat background
 * - elevated: Shadow for elevated appearance
 * - outlined: Only border, no background
 *
 * Features:
 * - Hover state (optional)
 * - Clickable support with proper focus states
 */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined';
  /** Enable hover effect */
  hoverable?: boolean;
  /** Make card clickable with proper focus states */
  clickable?: boolean;
  /** Remove padding from card */
  noPadding?: boolean;
}

const variantStyles = {
  default: [
    'bg-[var(--color-card-bg)]',
    'border border-[var(--color-card-border)]',
  ].join(' '),

  elevated: [
    'bg-[var(--color-card-bg)]',
    'border border-[var(--color-card-border)]',
    'shadow-md dark:shadow-md',
  ].join(' '),

  outlined: [
    'bg-transparent',
    'border border-[var(--color-border)]',
  ].join(' '),
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className = '',
      variant = 'default',
      hoverable = false,
      clickable = false,
      noPadding = false,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={[
          // Base
          'rounded-lg',
          // Padding
          noPadding ? '' : 'p-4',
          // Variant
          variantStyles[variant],
          // Hoverable
          hoverable ? 'hover:bg-[var(--color-card-hover)] transition-colors duration-[var(--duration-fast)]' : '',
          // Clickable
          clickable
            ? [
                'cursor-pointer',
                'hover:bg-[var(--color-card-hover)]',
                'focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] focus:ring-offset-2',
                'transition-colors duration-[var(--duration-fast)]',
              ].join(' ')
            : '',
          // Custom
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        tabIndex={clickable ? 0 : undefined}
        role={clickable ? 'button' : undefined}
        {...props}
      />
    );
  }
);

Card.displayName = 'Card';

/**
 * CardHeader - Header section of a card
 */
export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = '', ...props }, ref) => (
  <div
    ref={ref}
    className={[
      'flex flex-col space-y-1.5',
      className,
    ].join(' ')}
    {...props}
  />
));

CardHeader.displayName = 'CardHeader';

/**
 * CardTitle - Title within card header
 */
export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className = '', ...props }, ref) => (
  <h3
    ref={ref}
    className={[
      'text-base font-semibold',
      'text-[var(--color-text)]',
      'leading-tight',
      className,
    ].join(' ')}
    {...props}
  />
));

CardTitle.displayName = 'CardTitle';

/**
 * CardDescription - Description within card header
 */
export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className = '', ...props }, ref) => (
  <p
    ref={ref}
    className={[
      'text-sm',
      'text-[var(--color-text-secondary)]',
      className,
    ].join(' ')}
    {...props}
  />
));

CardDescription.displayName = 'CardDescription';

/**
 * CardContent - Main content area of a card
 */
export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = '', ...props }, ref) => (
  <div
    ref={ref}
    className={className}
    {...props}
  />
));

CardContent.displayName = 'CardContent';

/**
 * CardFooter - Footer section of a card
 */
export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = '', ...props }, ref) => (
  <div
    ref={ref}
    className={[
      'flex items-center pt-4',
      className,
    ].join(' ')}
    {...props}
  />
));

CardFooter.displayName = 'CardFooter';

export default Card;
