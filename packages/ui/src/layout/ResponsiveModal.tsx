/**
 * ResponsiveModal - Adaptive modal component for all screen sizes
 *
 * Behavior:
 * - Desktop: Centered modal with backdrop blur
 * - Mobile: Full-screen sheet that slides up from bottom
 *
 * Features:
 * - Swipe-to-close on mobile (drag header area)
 * - Escape key to close
 * - Browser back button support on mobile
 * - Prevents body scroll when open
 * - Focus trap
 * - Accessible with proper ARIA attributes
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { X, ChevronLeft } from 'lucide-react';
import { useIsMobile } from '../hooks/useBreakpoint';

export interface ResponsiveModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title: string;
  /** Optional icon to display in header */
  icon?: ReactNode;
  /** Size variant for desktop modal */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Custom className for the content container */
  className?: string;
  /** Custom testid prefix */
  'data-testid'?: string;
  /** Show sticky footer on mobile (for form actions) */
  footer?: ReactNode;
  /** Whether to hide the close button */
  hideClose?: boolean;
}

const sizeStyles = {
  sm: 'max-w-sm', // 384px
  md: 'max-w-md', // 448px
  lg: 'max-w-lg', // 512px
  xl: 'max-w-xl', // 576px
};

export function ResponsiveModal({
  open,
  onClose,
  children,
  title,
  icon,
  size = 'md',
  className = '',
  'data-testid': testId = 'responsive-modal',
  footer,
  hideClose = false,
}: ResponsiveModalProps) {
  const isMobile = useIsMobile();
  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const currentYRef = useRef<number>(0);

  // Prevent body scroll when modal is open
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

  // Handle browser back button on mobile
  useEffect(() => {
    if (!open || !isMobile) return;

    // Push a state when opening
    window.history.pushState({ responsiveModal: true }, '');

    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.responsiveModal === undefined) {
        onClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Go back if we still have our state on the stack
      if (window.history.state?.responsiveModal) {
        window.history.back();
      }
    };
  }, [open, isMobile, onClose]);

  // Handle swipe-to-close (from header area) - mobile only
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    startYRef.current = e.touches[0].clientY;
    currentYRef.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || startYRef.current === null) return;

    currentYRef.current = e.touches[0].clientY - startYRef.current;

    // Only allow dragging down
    if (currentYRef.current < 0) {
      currentYRef.current = 0;
    }

    // Apply transform during drag
    if (sheetRef.current && currentYRef.current > 0) {
      sheetRef.current.style.transform = `translateY(${currentYRef.current}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (!isMobile || startYRef.current === null) return;

    // If swiped down more than 100px, close the modal
    if (currentYRef.current > 100) {
      onClose();
    } else if (sheetRef.current) {
      // Snap back
      sheetRef.current.style.transform = 'translateY(0)';
    }

    startYRef.current = null;
    currentYRef.current = 0;
  };

  // Focus trap: focus first focusable element when opened
  useEffect(() => {
    if (open && sheetRef.current) {
      const firstFocusable = sheetRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }
  }, [open]);

  if (!open) return null;

  // Mobile: Full-screen sheet
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50"
        data-testid={testId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testId}-title`}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200"
          onClick={onClose}
          data-testid={`${testId}-backdrop`}
          aria-hidden="true"
        />

        {/* Sheet */}
        <div
          ref={sheetRef}
          className="absolute inset-x-0 bottom-0 top-0 bg-[var(--color-bg)] shadow-2xl flex flex-col transform transition-transform duration-200 ease-out"
          style={{ transform: open ? 'translateY(0)' : 'translateY(100%)' }}
          data-testid={`${testId}-content`}
        >
          {/* Drag handle and header */}
          <div
            className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-10"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Drag indicator */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-10 h-1 bg-[var(--color-border)] rounded-full" />

            {/* Back/Close button */}
            {!hideClose && (
              <button
                onClick={onClose}
                className="p-2 -ml-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 touch-target"
                aria-label="Close"
                data-testid={`${testId}-close`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            {/* Icon */}
            {icon && <span className="text-[var(--color-text-secondary)]">{icon}</span>}

            {/* Title */}
            <h2
              id={`${testId}-title`}
              className="flex-1 text-lg font-semibold text-[var(--color-text)] truncate"
            >
              {title}
            </h2>
          </div>

          {/* Content */}
          <div className={`flex-1 overflow-y-auto ${className}`}>{children}</div>

          {/* Footer */}
          {footer && (
            <div className="sticky bottom-0 px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
              {footer}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop: Centered modal
  return (
    <div
      className="fixed inset-0 z-50"
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${testId}-title`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid={`${testId}-backdrop`}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={sheetRef}
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full ${sizeStyles[size]} max-h-[90vh] overflow-y-auto mx-4`}
        data-testid={`${testId}-content`}
      >
        <div className="bg-white dark:bg-[var(--color-surface)] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              {icon && <span className="text-[var(--color-text-secondary)]">{icon}</span>}
              <h2
                id={`${testId}-title`}
                className="text-lg font-semibold text-gray-900 dark:text-white"
              >
                {title}
              </h2>
            </div>
            {!hideClose && (
              <button
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                aria-label="Close"
                data-testid={`${testId}-close`}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Content */}
          <div className={className}>{children}</div>

          {/* Footer */}
          {footer && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[var(--color-surface-secondary)]">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResponsiveModal;
