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
 * - Sectioned progress bar with section labels
 * - Smooth transitions between steps
 * - localStorage persistence for completion state and current step
 * - Conditional steps based on preset and director configuration
 * - Cross-page navigation support with isNavigating overlay
 * - Auto-advance when target element is not found
 * - Skip section functionality
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles, Loader2 } from 'lucide-react';
import type { TourSection } from '../../hooks/useOnboardingTour';

// ============================================================================
// Types
// ============================================================================

export interface TourStep {
  /** Unique identifier for this step */
  id: string;
  /** data-testid of the target element to highlight */
  targetTestId: string;
  /** Optional CSS selector override (used instead of targetTestId when provided) */
  targetSelector?: string;
  /** Title shown in the tooltip */
  title: string;
  /** Description shown in the tooltip */
  description: string;
  /** Whether this step should be included (for conditional steps) */
  enabled?: boolean;
  /** Page this step targets (e.g., '/tasks') for cross-page navigation */
  route?: string;
  /** Group label for progress bar (e.g., 'Tasks & Plans') */
  section?: string;
  /** Side effect before showing step (expand sidebar, etc.) */
  onActivate?: () => void;
  /** Cleanup when leaving this step (e.g., close dialogs) */
  onDeactivate?: () => void;
  /** If true, never auto-advance when target is not found (wait for user) */
  noAutoAdvance?: boolean;
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
  /** Called when user clicks Skip Section */
  onSkipSection?: () => void;
  /** Whether the app is navigating between pages (shows overlay without spotlight) */
  isNavigating?: boolean;
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
  // When target is not found, show full backdrop overlay (no spotlight cutout)
  // This prevents the overlay from disappearing during page transitions
  if (!targetRect) {
    return (
      <svg
        className="fixed inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 9998 }}
      >
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0, 0, 0, 0.5)" />
      </svg>
    );
  }

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
// Navigating Overlay (no spotlight, just dimmed backdrop)
// ============================================================================

function NavigatingOverlay() {
  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 pointer-events-none"
        style={{ zIndex: 9998 }}
      />
      <div
        className="fixed inset-0 flex items-center justify-center pointer-events-none"
        style={{ zIndex: 9999 }}
      >
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)] shadow-lg">
          <Loader2 className="w-4 h-4 text-[var(--color-primary)] animate-spin" />
          <span className="text-sm text-[var(--color-text-secondary)]">Navigating…</span>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Sectioned Progress Bar
// ============================================================================

interface SectionedProgressBarProps {
  sections: TourSection[];
  currentStepIndex: number;
  totalSteps: number;
}

function SectionedProgressBar({
  sections,
  currentStepIndex,
  totalSteps,
}: SectionedProgressBarProps) {
  // Find current section
  let currentSectionIdx = 0;
  for (let i = sections.length - 1; i >= 0; i--) {
    if (currentStepIndex >= sections[i].startIndex) {
      currentSectionIdx = i;
      break;
    }
  }

  const currentSectionData = sections[currentSectionIdx];
  const stepWithinSection = currentStepIndex - currentSectionData.startIndex + 1;

  return (
    <div className="w-full">
      {/* Segmented bar */}
      <div className="flex items-center gap-1 mb-1.5">
        {sections.map((section, idx) => {
          const segmentWidth = (section.count / totalSteps) * 100;
          let fillPercent = 0;

          if (idx < currentSectionIdx) {
            // Completed section
            fillPercent = 100;
          } else if (idx === currentSectionIdx) {
            // Current section — partially filled
            fillPercent =
              ((currentStepIndex - section.startIndex + 1) / section.count) * 100;
          }
          // Future sections remain at 0

          return (
            <div
              key={section.label || idx}
              className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden"
              style={{ width: `${segmentWidth}%`, minWidth: 8 }}
            >
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
                style={{ width: `${fillPercent}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Section label + step count */}
      <div className="flex items-center justify-between">
        {currentSectionData.label ? (
          <span className="text-xs text-[var(--color-text-tertiary)] font-medium">
            {currentSectionData.label}
          </span>
        ) : (
          <span />
        )}
        <span className="text-xs text-[var(--color-text-tertiary)]">
          Step {stepWithinSection} of {currentSectionData.count}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Tooltip Component
// ============================================================================

interface TourTooltipProps {
  step: TourStep;
  stepIndex: number;
  steps: TourStep[];
  sections: TourSection[];
  targetRect: DOMRect | null;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onSkipSection?: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

function TourTooltip({
  step,
  stepIndex,
  steps,
  sections,
  targetRect,
  onNext,
  onPrev,
  onSkip,
  onSkipSection,
  isFirstStep,
  isLastStep,
}: TourTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<TooltipCoords | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const totalSteps = steps.length;

  // Determine if we're in the last section (hide skip section if so)
  const currentSectionIdx = useMemo(() => {
    for (let i = sections.length - 1; i >= 0; i--) {
      if (stepIndex >= sections[i].startIndex) return i;
    }
    return 0;
  }, [sections, stepIndex]);
  const isLastSection = currentSectionIdx === sections.length - 1;
  const hasSections = sections.length > 1 || (sections.length === 1 && sections[0].label);

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
        <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          {/* Sectioned progress bar */}
          {hasSections ? (
            <SectionedProgressBar
              sections={sections}
              currentStepIndex={stepIndex}
              totalSteps={totalSteps}
            />
          ) : (
            <div className="flex items-center gap-1.5 mb-2">
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
          )}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-2">
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
              {onSkipSection && hasSections && !isLastSection && (
                <button
                  onClick={onSkipSection}
                  className="px-2 py-1.5 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                  data-testid="onboarding-skip-section"
                >
                  Skip section
                </button>
              )}
            </div>
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
  onSkipSection,
  isNavigating,
}: OnboardingTourProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTargetRectRef = useRef<DOMRect | null>(null);
  const nullCountRef = useRef(0);
  const prevStepRef = useRef<number>(currentStep);

  // Filter to only enabled steps
  const activeSteps = useMemo(
    () => steps.filter((s) => s.enabled !== false),
    [steps]
  );

  const currentStepData = activeSteps[currentStep];

  // Compute sections from active steps
  const sections = useMemo(() => {
    const result: TourSection[] = [];
    let currentLabel = '';
    for (let i = 0; i < activeSteps.length; i++) {
      const sectionLabel = activeSteps[i].section ?? '';
      if (sectionLabel !== currentLabel || i === 0) {
        result.push({ label: sectionLabel, startIndex: i, count: 1 });
        currentLabel = sectionLabel;
      } else {
        result[result.length - 1].count++;
      }
    }
    return result;
  }, [activeSteps]);

  // Fire onDeactivate for previous step and onActivate for new step when step changes
  useEffect(() => {
    if (!isActive) return;

    // Call onDeactivate for the previous step when navigating away
    if (prevStepRef.current !== currentStep) {
      const prevStep = activeSteps[prevStepRef.current];
      if (prevStep?.onDeactivate) {
        prevStep.onDeactivate();
      }
      prevStepRef.current = currentStep;
    }

    // Reset null counter on step change
    nullCountRef.current = 0;

    if (currentStepData?.onActivate) {
      currentStepData.onActivate();
    }
  }, [isActive, currentStep, currentStepData, activeSteps]);

  // Find and track the target element
  const updateTargetRect = useCallback(() => {
    if (!currentStepData) {
      setTargetRect(null);
      prevTargetRectRef.current = null;
      nullCountRef.current = 0;
      return;
    }

    const selector = currentStepData.targetSelector
      || `[data-testid="${currentStepData.targetTestId}"]`;
    const el = document.querySelector(selector);
    if (el) {
      const newRect = el.getBoundingClientRect();
      prevTargetRectRef.current = newRect;
      nullCountRef.current = 0;
      setTargetRect((prev) => {
        if (
          prev &&
          prev.top === newRect.top &&
          prev.left === newRect.left &&
          prev.width === newRect.width &&
          prev.height === newRect.height
        ) {
          return prev; // No change — keep same reference
        }
        return newRect;
      });
    } else {
      // Don't immediately null out — keep previous rect briefly during transitions
      // Only null out after multiple consecutive misses (grace period)
      nullCountRef.current++;
      if (!prevTargetRectRef.current || nullCountRef.current > 6) {
        setTargetRect(null);
      }
      // Otherwise keep the previous targetRect (don't update state)
    }
  }, [currentStepData]);

  // Update rect on step change and handle resize/scroll
  useEffect(() => {
    if (!isActive) return;

    updateTargetRect();

    // Re-calculate on resize and scroll
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);

    // Determine poll duration: 5s for steps with route, 3s otherwise
    const pollDuration = currentStepData?.route ? 5000 : 3000;

    // Poll briefly in case the target element renders asynchronously
    const pollTimer = setInterval(updateTargetRect, 500);
    const stopPoll = setTimeout(() => clearInterval(pollTimer), pollDuration);

    // Auto-advance if target is not found after full polling duration
    // Skip auto-advance for steps that explicitly opt out (detail panels, etc.)
    if (!currentStepData?.noAutoAdvance) {
      autoAdvanceTimerRef.current = setTimeout(() => {
        const autoAdvanceSelector = currentStepData?.targetSelector
          || `[data-testid="${currentStepData?.targetTestId}"]`;
        const el = currentStepData
          ? document.querySelector(autoAdvanceSelector)
          : null;
        if (!el) {
          onNext();
        }
      }, pollDuration + 500); // Small buffer after polling ends
    }

    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
      clearInterval(pollTimer);
      clearTimeout(stopPoll);
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [isActive, currentStep, updateTargetRect, currentStepData, onNext]);

  // Cancel auto-advance when target is found
  useEffect(() => {
    if (targetRect && autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, [targetRect]);

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

  // Show navigating overlay when navigating between pages and target not yet found
  if (isNavigating && !targetRect) {
    return (
      <>
        <div
          className="fixed inset-0"
          style={{ zIndex: 9997 }}
          data-testid="onboarding-backdrop"
        />
        <NavigatingOverlay />
      </>
    );
  }

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
        steps={activeSteps}
        sections={sections}
        targetRect={targetRect}
        onNext={onNext}
        onPrev={onPrev}
        onSkip={onSkip}
        onSkipSection={onSkipSection}
        isFirstStep={currentStep === 0}
        isLastStep={currentStep === activeSteps.length - 1}
      />
    </>
  );
}
