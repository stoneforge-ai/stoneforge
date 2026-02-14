/**
 * MobileDetailSheet - Full-screen sheet for mobile detail views
 *
 * A full-screen overlay that slides up from the bottom on mobile devices.
 * Used to display detail panels (task, plan, entity, etc.) on mobile.
 *
 * Features:
 * - Slides up from bottom with animation
 * - Sticky header with close button
 * - Closes on swipe-down gesture
 * - Prevents body scroll when open
 * - Hardware back button support
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

interface MobileDetailSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  'data-testid'?: string;
}

export function MobileDetailSheet({
  open,
  onClose,
  children,
  title,
  'data-testid': testId = 'mobile-detail-sheet',
}: MobileDetailSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const currentYRef = useRef<number>(0);

  // Prevent body scroll when sheet is open
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

  // Handle browser back button
  useEffect(() => {
    if (!open) return;

    // Push a state when opening
    window.history.pushState({ mobileSheet: true }, '');

    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.mobileSheet === undefined) {
        onClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Go back if we still have our state on the stack
      if (window.history.state?.mobileSheet) {
        window.history.back();
      }
    };
  }, [open, onClose]);

  // Handle swipe-to-close (from header area)
  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    currentYRef.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current === null) return;

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
    if (startYRef.current === null) return;

    // If swiped down more than 100px, close the sheet
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

  return (
    <div
      className="fixed inset-0 z-50"
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Detail view'}
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
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 touch-target"
            aria-label="Close"
            data-testid={`${testId}-close`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Title */}
          {title && (
            <h2 className="flex-1 text-lg font-semibold text-[var(--color-text)] truncate">
              {title}
            </h2>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
