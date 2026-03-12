/**
 * OnboardingTour - Guided tooltip walkthrough for first-time users
 *
 * Displays a sequential tooltip tour highlighting key areas of the dashboard.
 * Each step targets a DOM element by data-testid, showing a tooltip with a
 * backdrop overlay that dims the rest of the page.
 *
 * Features:
 * - Sequential tooltip tour with Next/Back/Skip controls
 * - Backdrop overlay with highlighted target element
 * - Step counter (e.g., "2 of 6")
 * - Smooth transitions between steps
 * - localStorage persistence for completion state
 * - Conditional steps based on preset and director configuration
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface TourStep {
  /** Unique identifier for this step */
  id: string;
  /** data-testid of the target element to highlight */
  targetTestId: string;
  /** Title shown in the tooltip */
  title: string;
  /** Description shown in the tooltip */
  description: string;
  /** Whether this step should be included (for conditional steps) */
  enabled?: boolean;
}

interface OnboardingTourProps {
  /** Whether the tour is currently active */
  isActive: boolean;
  /** Current step index */
  currentStep: number;
  /** All defined steps (before filtering) */
  steps: TourStep[];
  /** Called when user clicks Next */
  onNext: () => void;
  /** Called when user clicks Back */
  onPrev: () => void;
  /** Called when user clicks Skip */
  onSkip: () => void;
}

// ============================================================================
// Tooltip positioning
// ============================================================================

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipCoords {
  top: number;
  left: number;
  position: TooltipPosition;
  arrowStyle: React.CSSProperties;
}

const TOOLTIP_WIDTH = 340;
const TOOLTIP_MARGIN = 16;
const ARROW_SIZE = 8;

function calculateTooltipPosition(
  targetRect: DOMRect,
  tooltipHeight: number,
): TooltipCoords {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Prefer bottom, then top, then right, then left
  const spaceBelow = viewportHeight - targetRect.bottom;
  const spaceAbove = targetRect.top;
  const spaceRight = viewportWidth - targetRect.right;
  const spaceLeft = targetRect.left;

  let position: TooltipPosition = 'bottom';
  let top = 0;
  let left = 0;

  const neededHeight = tooltipHeight + TOOLTIP_MARGIN + ARROW_SIZE;

  if (spaceBelow >= neededHeight) {
    position = 'bottom';
    top = targetRect.bottom + TOOLTIP_MARGIN;
    left = targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2;
  } else if (spaceAbove >= neededHeight) {
    position = 'top';
    top = targetRect.top - tooltipHeight - TOOLTIP_MARGIN;
    left = targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2;
  } else if (spaceRight >= TOOLTIP_WIDTH + TOOLTIP_MARGIN + ARROW_SIZE) {
    position = 'right';
    top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
    left = targetRect.right + TOOLTIP_MARGIN;
  } else if (spaceLeft >= TOOLTIP_WIDTH + TOOLTIP_MARGIN + ARROW_SIZE) {
    position = 'left';
    top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
    left = targetRect.left - TOOLTIP_WIDTH - TOOLTIP_MARGIN;
  } else {
    // Fallback: bottom-center of screen
    position = 'bottom';
    top = targetRect.bottom + TOOLTIP_MARGIN;
    left = viewportWidth / 2 - TOOLTIP_WIDTH / 2;
  }

  // Clamp horizontal position within viewport
  left = Math.max(TOOLTIP_MARGIN, Math.min(left, viewportWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN));
  // Clamp vertical position within viewport
  top = Math.max(TOOLTIP_MARGIN, Math.min(top, viewportHeight - tooltipHeight - TOOLTIP_MARGIN));

  // Arrow positioning
  const arrowStyle: React.CSSProperties = {};
  if (position === 'bottom') {
    arrowStyle.top = -ARROW_SIZE;
    arrowStyle.left = Math.min(
      Math.max(ARROW_SIZE * 2, targetRect.left + targetRect.width / 2 - left),
      TOOLTIP_WIDTH - ARROW_SIZE * 2
    );
    arrowStyle.borderLeft = `${ARROW_SIZE}px solid transparent`;
    arrowStyle.borderRight = `${ARROW_SIZE}px solid transparent`;
    arrowStyle.borderBottom = `${ARROW_SIZE}px solid var(--color-surface-elevated)`;
  } else if (position === 'top') {
    arrowStyle.bottom = -ARROW_SIZE;
    arrowStyle.left = Math.min(
      Math.max(ARROW_SIZE * 2, targetRect.left + targetRect.width / 2 - left),
      TOOLTIP_WIDTH - ARROW_SIZE * 2
    );
    arrowStyle.borderLeft = `${ARROW_SIZE}px solid transparent`;
    arrowStyle.borderRight = `${ARROW_SIZE}px solid transparent`;
    arrowStyle.borderTop = `${ARROW_SIZE}px solid var(--color-surface-elevated)`;
  } else if (position === 'right') {
    arrowStyle.left = -ARROW_SIZE;
    arrowStyle.top = Math.max(ARROW_SIZE * 2, tooltipHeight / 2 - ARROW_SIZE);
    arrowStyle.borderTop = `${ARROW_SIZE}px solid transparent`;
    arrowStyle.borderBottom = `${ARROW_SIZE}px solid transparent`;
    arrowStyle.borderRight = `${ARROW_SIZE}px solid var(--color-surface-elevated)`;
  } else {
    arrowStyle.right = -ARROW_SIZE;
    arrowStyle.top = Math.max(ARROW_SIZE * 2, tooltipHeight / 2 - ARROW_SIZE);
    arrowStyle.borderTop = `${ARROW_SIZE}px solid transparent`;
    arrowStyle.borderBottom = `${ARROW_SIZE}px solid transparent`;
    arrowStyle.borderLeft = `${ARROW_SIZE}px solid var(--color-surface-elevated)`;
  }

  return { top, left, position, arrowStyle };
}

// ============================================================================
// Spotlight Overlay (SVG-based cutout)
// ============================================================================

function SpotlightOverlay({ targetRect }: { targetRect: DOMRect | null }) {
  if (!targetRect) return null;

  const padding = 6;
  const borderRadius = 10;

  const x = targetRect.left - padding;
  const y = targetRect.top - padding;
  const w = targetRect.width + padding * 2;
  const h = targetRect.height + padding * 2;

  return (
    <svg
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 9998 }}
    >
      <defs>
        <mask id="onboarding-spotlight-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={borderRadius}
            ry={borderRadius}
            fill="black"
          />
        </mask>
      </defs>
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="rgba(0, 0, 0, 0.5)"
        mask="url(#onboarding-spotlight-mask)"
      />
      {/* Glow border around the highlighted element */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={borderRadius}
        ry={borderRadius}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeOpacity="0.6"
      />
    </svg>
  );
}

// ============================================================================
// Tooltip Component
// ============================================================================

interface TourTooltipProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  targetRect: DOMRect | null;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

function TourTooltip({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  onNext,
  onPrev,
  onSkip,
  isFirstStep,
  isLastStep,
}: TourTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<TooltipCoords | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Calculate position after render so we know tooltip height
  useEffect(() => {
    if (!targetRect || !tooltipRef.current) return;

    const tooltipHeight = tooltipRef.current.offsetHeight;
    const newCoords = calculateTooltipPosition(targetRect, tooltipHeight);
    setCoords(newCoords);

    // Trigger fade-in after positioning
    requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => {
      setIsVisible(false);
    };
  }, [targetRect, step.id]);

  // Reset visibility on step change
  useEffect(() => {
    setIsVisible(false);
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, [stepIndex]);

  return (
    <div
      ref={tooltipRef}
      className={`fixed transition-all duration-300 ease-out ${
        isVisible && coords ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      }`}
      style={{
        zIndex: 9999,
        width: TOOLTIP_WIDTH,
        top: coords?.top ?? -9999,
        left: coords?.left ?? -9999,
      }}
      role="dialog"
      aria-label={`Onboarding step ${stepIndex + 1} of ${totalSteps}: ${step.title}`}
      data-testid="onboarding-tooltip"
    >
      {/* Arrow */}
      {coords && (
        <div
          className="absolute"
          style={{
            width: 0,
            height: 0,
            ...coords.arrowStyle,
          }}
        />
      )}

      {/* Tooltip body */}
      <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
            <span className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
              Getting Started
            </span>
          </div>
          <button
            onClick={onSkip}
            className="p-1 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
            aria-label="Skip tour"
            data-testid="onboarding-skip"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-1">
            {step.title}
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
            {step.description}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          {/* Step counter */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === stepIndex
                    ? 'w-4 bg-[var(--color-primary)]'
                    : i < stepIndex
                      ? 'w-1.5 bg-[var(--color-primary-muted)]'
                      : 'w-1.5 bg-[var(--color-border)]'
                }`}
              />
            ))}
            <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">
              {stepIndex + 1} of {totalSteps}
            </span>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                onClick={onPrev}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors"
                data-testid="onboarding-prev"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}
            <button
              onClick={onNext}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-primary)] hover:opacity-90 rounded-md transition-opacity"
              data-testid="onboarding-next"
            >
              {isLastStep ? 'Finish' : 'Next'}
              {!isLastStep && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main OnboardingTour Component
// ============================================================================

export function OnboardingTour({
  isActive,
  currentStep,
  steps,
  onNext,
  onPrev,
  onSkip,
}: OnboardingTourProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Filter to only enabled steps
  const activeSteps = useMemo(
    () => steps.filter((s) => s.enabled !== false),
    [steps]
  );

  const currentStepData = activeSteps[currentStep];

  // Find and track the target element
  const updateTargetRect = useCallback(() => {
    if (!currentStepData) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(
      `[data-testid="${currentStepData.targetTestId}"]`
    );
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [currentStepData]);

  // Update rect on step change and handle resize/scroll
  useEffect(() => {
    if (!isActive) return;

    updateTargetRect();

    // Re-calculate on resize and scroll
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);

    // Poll briefly in case the target element renders asynchronously
    const pollTimer = setInterval(updateTargetRect, 500);
    const stopPoll = setTimeout(() => clearInterval(pollTimer), 3000);

    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
      clearInterval(pollTimer);
      clearTimeout(stopPoll);
    };
  }, [isActive, currentStep, updateTargetRect]);

  // Handle escape key to skip
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        onNext();
      } else if (e.key === 'ArrowLeft') {
        onPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onSkip, onNext, onPrev]);

  if (!isActive || !currentStepData) return null;

  return (
    <>
      {/* Backdrop overlay with spotlight cutout */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 9997 }}
        onClick={onSkip}
        data-testid="onboarding-backdrop"
      />
      <SpotlightOverlay targetRect={targetRect} />

      {/* Tooltip */}
      <TourTooltip
        step={currentStepData}
        stepIndex={currentStep}
        totalSteps={activeSteps.length}
        targetRect={targetRect}
        onNext={onNext}
        onPrev={onPrev}
        onSkip={onSkip}
        isFirstStep={currentStep === 0}
        isLastStep={currentStep === activeSteps.length - 1}
      />
    </>
  );
}
