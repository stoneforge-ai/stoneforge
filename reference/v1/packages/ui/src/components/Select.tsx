import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Select Component
 *
 * An accessible select/dropdown built on Radix UI Select primitive.
 * Consistent styling with Input components, smooth open/close animation.
 *
 * Usage:
 * ```tsx
 * <Select value={value} onValueChange={setValue}>
 *   <SelectTrigger>
 *     <SelectValue placeholder="Select an option" />
 *   </SelectTrigger>
 *   <SelectContent>
 *     <SelectGroup>
 *       <SelectLabel>Group Label</SelectLabel>
 *       <SelectItem value="1">Option 1</SelectItem>
 *       <SelectItem value="2">Option 2</SelectItem>
 *       <SelectSeparator />
 *       <SelectItem value="3">Option 3</SelectItem>
 *     </SelectGroup>
 *   </SelectContent>
 * </Select>
 * ```
 */

const Select: typeof SelectPrimitive.Root = SelectPrimitive.Root;
const SelectGroup: typeof SelectPrimitive.Group = SelectPrimitive.Group;
const SelectValue: typeof SelectPrimitive.Value = SelectPrimitive.Value;

/**
 * SelectTrigger - The button that opens the dropdown
 */
export interface SelectTriggerProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> {
  size?: 'sm' | 'md' | 'lg';
  error?: boolean;
  fullWidth?: boolean;
}

const triggerSizeStyles = {
  sm: 'h-7 px-2.5 text-sm',
  md: 'h-9 px-3 text-sm',
  lg: 'h-11 px-4 text-base',
};

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  SelectTriggerProps
>(({ className = '', children, size = 'md', error = false, fullWidth = false, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={[
      // Base
      'inline-flex items-center justify-between gap-2',
      // Background
      'bg-[var(--color-input-bg)]',
      'text-[var(--color-text)]',
      // Border
      error
        ? 'border border-[var(--color-error-500)]'
        : 'border border-[var(--color-input-border)]',
      // Rounded
      'rounded-md',
      // Size
      triggerSizeStyles[size],
      // Width
      fullWidth ? 'w-full' : '',
      // Placeholder color
      'data-[placeholder]:text-[var(--color-text-tertiary)]',
      // Focus
      'focus:outline-none',
      error
        ? 'focus:ring-2 focus:ring-[var(--color-error-200)] dark:focus:ring-[var(--color-error-900)]'
        : 'focus:ring-2 focus:ring-[var(--color-input-focus-ring)] focus:border-[var(--color-border-focus)]',
      // Hover
      'hover:border-[var(--color-neutral-400)] dark:hover:border-[var(--color-neutral-600)]',
      // Transitions
      'transition-colors duration-[var(--duration-fast)]',
      // Disabled
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-bg-secondary)]',
      className,
    ].join(' ')}
    {...props}
  >
    <span className="truncate">{children}</span>
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 flex-shrink-0 text-[var(--color-text-tertiary)]" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

/**
 * SelectScrollUpButton - Scroll button at top of long lists
 */
const SelectScrollUpButton: React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton> & React.RefAttributes<HTMLDivElement>
> = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className = '', ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={[
      'flex items-center justify-center h-6',
      'cursor-default',
      'text-[var(--color-text-tertiary)]',
      className,
    ].join(' ')}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

/**
 * SelectScrollDownButton - Scroll button at bottom of long lists
 */
const SelectScrollDownButton: React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton> & React.RefAttributes<HTMLDivElement>
> = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className = '', ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={[
      'flex items-center justify-center h-6',
      'cursor-default',
      'text-[var(--color-text-tertiary)]',
      className,
    ].join(' ')}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

/**
 * SelectContent - The dropdown content container
 */
const SelectContent: React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & React.RefAttributes<HTMLDivElement>
> = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className = '', children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={[
        // Z-index
        'z-[var(--z-index-dropdown)]',
        // Positioning
        'relative',
        // Background
        'bg-[var(--color-bg-elevated)] dark:bg-[var(--color-card-bg)]',
        // Border
        'border border-[var(--color-border)] dark:border-[var(--color-card-border)]',
        // Shadow
        'shadow-lg dark:shadow-lg',
        // Rounded
        'rounded-lg',
        // Overflow
        'overflow-hidden',
        // Padding
        'p-1',
        // Size
        'min-w-[8rem]',
        position === 'popper' &&
          'max-h-[var(--radix-select-content-available-height)]',
        // Animations
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={
          position === 'popper'
            ? 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
            : ''
        }
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

/**
 * SelectLabel - Group label
 */
const SelectLabel: React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label> & React.RefAttributes<HTMLDivElement>
> = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className = '', ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={[
      'px-2 py-1.5',
      'text-xs font-semibold',
      'text-[var(--color-text-tertiary)]',
      'uppercase tracking-wide',
      className,
    ].join(' ')}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

/**
 * SelectItem - Individual select option
 */
const SelectItem: React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & React.RefAttributes<HTMLDivElement>
> = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className = '', children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={[
      // Layout
      'relative flex items-center',
      'w-full',
      // Padding (with space for indicator)
      'pl-8 pr-2 py-2',
      // Typography
      'text-sm',
      'text-[var(--color-text)]',
      // Rounded
      'rounded-md',
      // States
      'cursor-pointer select-none outline-none',
      'hover:bg-[var(--color-surface-hover)]',
      'focus:bg-[var(--color-surface-hover)]',
      'data-[highlighted]:bg-[var(--color-surface-hover)]',
      'data-[disabled]:opacity-50 data-[disabled]:pointer-events-none',
      className,
    ].join(' ')}
    {...props}
  >
    <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4 text-[var(--color-primary)]" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

/**
 * SelectSeparator - Separator between items or groups
 */
const SelectSeparator: React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator> & React.RefAttributes<HTMLDivElement>
> = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className = '', ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={[
      '-mx-1 my-1 h-px',
      'bg-[var(--color-border)] dark:bg-[var(--color-card-border)]',
      className,
    ].join(' ')}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
