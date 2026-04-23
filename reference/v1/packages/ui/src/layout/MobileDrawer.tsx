/**
 * MobileDrawer - Slide-out drawer for mobile navigation
 *
 * A full-screen overlay drawer that slides in from the left side.
 * Used to display the sidebar on mobile devices.
 *
 * Features:
 * - Slides in from left with backdrop
 * - Closes on backdrop tap
 * - Supports swipe-to-close gesture
 * - Prevents body scroll when open
 * - Trap focus within drawer for accessibility
 * - Escape key closes drawer
 */

import { useEffect, useRef, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react';
import { X } from 'lucide-react';

export interface MobileDrawerProps {
  /** Whether the drawer is open */
  open: boolean;
  /** Callback when the drawer should close */
  onClose: () => void;
  /** Content to render inside the drawer (typically a Sidebar) */
  children: ReactNode;
  /** Width of the drawer (default: 280px) */
  width?: string | number;
  /** Maximum width as percentage of viewport (default: 85vw) */
  maxWidth?: string;
  /** Test ID for e2e testing */
  'data-testid'?: string;
  /** Custom class for the drawer content */
  contentClassName?: string;
  /** Whether to show the close button (default: true) */
  showCloseButton?: boolean;
  /** Custom close button content */
  closeButtonContent?: ReactNode;
  /** Swipe threshold in pixels to trigger close (default: 50) */
  swipeThreshold?: number;
  /** Backdrop blur (default: true) */
  backdropBlur?: boolean;
  /** Custom backdrop class */
  backdropClassName?: string;
}

export function MobileDrawer({
  open,
  onClose,
  children,
  width = 280,
  maxWidth = '85vw',
  'data-testid': testId = 'mobile-drawer',
  contentClassName = '',
  showCloseButton = true,
  closeButtonContent,
  swipeThreshold = 50,
  backdropBlur = true,
  backdropClassName = '',
}: MobileDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number | null>(null);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  // Close on escape key
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Handle swipe-to-close
  const handleTouchStart = (e: ReactTouchEvent) => {
    startXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: ReactTouchEvent) => {
    if (startXRef.current === null) return;

    const currentX = e.touches[0].clientX;
    const deltaX = startXRef.current - currentX;

    // If swiping left more than threshold, close the drawer
    if (deltaX > swipeThreshold) {
      onClose();
      startXRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    startXRef.current = null;
  };

  // Focus trap: focus first focusable element when opened, and trap tab key
  useEffect(() => {
    if (!open || !drawerRef.current) return;

    const focusableElements = drawerRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0] as HTMLElement;
    const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;

    // Focus the first focusable element
    firstFocusable?.focus();

    // Trap tab key within drawer
    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          lastFocusable?.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          firstFocusable?.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, [open]);

  if (!open) return null;

  const widthValue = typeof width === 'number' ? `${width}px` : width;

  return (
    <div
      className="fixed inset-0 z-50"
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
          backdropBlur ? 'backdrop-blur-sm' : ''
        } ${backdropClassName}`}
        onClick={onClose}
        data-testid={`${testId}-backdrop`}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`absolute left-0 top-0 bottom-0 bg-[var(--color-sidebar-bg)] shadow-2xl transform transition-transform duration-200 ease-out flex flex-col ${contentClassName}`}
        style={{
          width: widthValue,
          maxWidth: maxWidth,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        data-testid={`${testId}-content`}
      >
        {/* Close button */}
        {showCloseButton && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-sidebar-item-hover)] transition-colors duration-150 z-10"
            aria-label="Close navigation menu"
            data-testid={`${testId}-close`}
          >
            {closeButtonContent ?? <X className="w-5 h-5" />}
          </button>
        )}

        {/* Drawer content (Sidebar) */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
