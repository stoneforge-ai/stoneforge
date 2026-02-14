import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

/**
 * Dialog Component
 *
 * An accessible modal dialog built on Radix UI Dialog primitive.
 * Features backdrop blur, centered content, and smooth animations.
 *
 * Usage:
 * ```tsx
 * <Dialog open={isOpen} onOpenChange={setIsOpen}>
 *   <DialogContent>
 *     <DialogHeader>
 *       <DialogTitle>Dialog Title</DialogTitle>
 *       <DialogDescription>Optional description text</DialogDescription>
 *     </DialogHeader>
 *     <DialogBody>
 *       Content goes here
 *     </DialogBody>
 *     <DialogFooter>
 *       <Button variant="secondary" onClick={() => setIsOpen(false)}>Cancel</Button>
 *       <Button onClick={handleSubmit}>Submit</Button>
 *     </DialogFooter>
 *   </DialogContent>
 * </Dialog>
 * ```
 */

// Root and Trigger from Radix - explicit type annotations for portability
const Dialog: typeof DialogPrimitive.Root = DialogPrimitive.Root;
const DialogTrigger: typeof DialogPrimitive.Trigger = DialogPrimitive.Trigger;
const DialogPortal: typeof DialogPrimitive.Portal = DialogPrimitive.Portal;
const DialogClose: typeof DialogPrimitive.Close = DialogPrimitive.Close;

/**
 * DialogOverlay - Backdrop with blur effect
 */
const DialogOverlay: React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & React.RefAttributes<HTMLDivElement>
> = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={[
      // Base
      'fixed inset-0',
      'bg-black/50 dark:bg-black/70',
      'backdrop-blur-sm',
      // Animations
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      // Z-index
      'z-[var(--z-index-modal-backdrop)]',
      className,
    ].join(' ')}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * DialogContent - Main dialog container
 */
export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Size of the dialog */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Hide the close button */
  hideClose?: boolean;
}

const sizeStyles = {
  sm: 'max-w-sm',   // 384px
  md: 'max-w-md',   // 448px
  lg: 'max-w-lg',   // 512px
  xl: 'max-w-xl',   // 576px
  full: 'max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]',
};

const DialogContent = React.forwardRef<
  HTMLDivElement,
  DialogContentProps
>(({ className = '', children, size = 'md', hideClose = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={[
        // Positioning
        'fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]',
        // Size
        'w-full',
        sizeStyles[size],
        // Styling
        'bg-[var(--color-bg-elevated)] dark:bg-[var(--color-card-bg)]',
        'border border-[var(--color-border)] dark:border-[var(--color-card-border)]',
        'rounded-xl',
        'shadow-2xl dark:shadow-2xl',
        // Overflow
        'overflow-hidden',
        // Animations
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
        'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
        'duration-200',
        // Z-index
        'z-[var(--z-index-modal)]',
        // Focus
        'focus:outline-none',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close
          className={[
            'absolute right-3 top-3',
            'p-1.5 rounded-md',
            'text-[var(--color-text-tertiary)]',
            'hover:text-[var(--color-text-secondary)]',
            'hover:bg-[var(--color-surface-hover)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]',
            'transition-colors duration-[var(--duration-fast)]',
            'disabled:pointer-events-none',
          ].join(' ')}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

/**
 * DialogHeader - Container for title and description
 */
const DialogHeader = ({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={[
      'px-5 py-4',
      'border-b border-[var(--color-border)] dark:border-[var(--color-card-border)]',
      className,
    ].join(' ')}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

/**
 * DialogBody - Main content area
 */
const DialogBody = ({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={[
      'px-5 py-4',
      'overflow-y-auto',
      'max-h-[calc(100vh-16rem)]',
      className,
    ].join(' ')}
    {...props}
  />
);
DialogBody.displayName = 'DialogBody';

/**
 * DialogFooter - Container for action buttons
 */
const DialogFooter = ({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={[
      'px-5 py-4',
      'border-t border-[var(--color-border)] dark:border-[var(--color-card-border)]',
      'bg-[var(--color-bg-secondary)] dark:bg-[var(--color-surface)]',
      'flex items-center justify-end gap-3',
      className,
    ].join(' ')}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

/**
 * DialogTitle - Title text
 */
const DialogTitle: React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & React.RefAttributes<HTMLHeadingElement>
> = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={[
      'text-lg font-semibold',
      'text-[var(--color-text)]',
      'leading-tight',
      className,
    ].join(' ')}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

/**
 * DialogDescription - Description/subtitle text
 */
const DialogDescription: React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> & React.RefAttributes<HTMLParagraphElement>
> = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={[
      'mt-1.5 text-sm',
      'text-[var(--color-text-secondary)]',
      className,
    ].join(' ')}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
