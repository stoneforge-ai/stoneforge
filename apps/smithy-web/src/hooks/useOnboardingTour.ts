/**
 * useOnboardingTour - Manages onboarding tour state with localStorage persistence
 *
 * Controls whether the tour should be shown, tracks the current step,
 * and persists completion/skip state so the tour only shows once.
 * Supports sectioned progress and cross-page navigation.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { TourStep } from '../components/onboarding';

const STORAGE_KEY = 'stoneforge:onboarding-complete';
const STEP_STORAGE_KEY = 'stoneforge:onboarding-step';

export interface TourSection {
  label: string;
  startIndex: number;
  count: number;
}

export interface OnboardingTourState {
  /** Whether the tour is currently active (visible) */
  isActive: boolean;
  /** Current step index (0-based, within active steps) */
  currentStep: number;
  /** Total number of active steps in the tour */
  totalSteps: number;
  /** Whether the tour has been completed or skipped previously */
  isCompleted: boolean;
  /** Computed sections from step.section grouping */
  sections: TourSection[];
  /** Index of the current section (0-based) */
  currentSection: number;
  /** Total number of sections */
  totalSections: number;
  /** Start the tour */
  start: () => void;
  /** Advance to the next step */
  next: () => void;
  /** Go back to the previous step */
  prev: () => void;
  /** Skip/dismiss the tour (marks as completed) */
  skip: () => void;
  /** Complete the tour (marks as completed) */
  complete: () => void;
  /** Resume the tour from the persisted step (for browser refresh) */
  resume: () => void;
  /** Reset the tour (clears completion flag for re-access from settings) */
  reset: () => void;
  /** Jump to an arbitrary step index */
  goToStep: (index: number) => void;
  /** Skip to the first step of the next section */
  skipSection: () => void;
}

/**
 * Hook for managing the onboarding guided tour.
 *
 * @param steps - All defined tour steps (before filtering)
 * @returns Tour state and control functions
 */
export function useOnboardingTour(steps: TourStep[]): OnboardingTourState {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  // Compute active steps (filter enabled !== false)
  const activeSteps = useMemo(
    () => steps.filter((s) => s.enabled !== false),
    [steps]
  );

  const totalSteps = activeSteps.length;

  // Compute sections from step.section grouping
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

  // Determine current section index
  const currentSection = useMemo(() => {
    for (let i = sections.length - 1; i >= 0; i--) {
      if (currentStep >= sections[i].startIndex) {
        return i;
      }
    }
    return 0;
  }, [sections, currentStep]);

  const totalSections = sections.length;

  // Restore currentStep from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const completed = localStorage.getItem(STORAGE_KEY) === 'true';
    if (!completed) {
      const savedStep = localStorage.getItem(STEP_STORAGE_KEY);
      if (savedStep !== null) {
        const parsed = parseInt(savedStep, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed < totalSteps) {
          setCurrentStep(parsed);
        }
      }
    }
  }, [totalSteps]);

  // Persist currentStep to localStorage whenever it changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isActive) {
      localStorage.setItem(STEP_STORAGE_KEY, String(currentStep));
    }
  }, [currentStep, isActive]);

  const markCompleted = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    localStorage.removeItem(STEP_STORAGE_KEY);
    setIsCompleted(true);
    setIsActive(false);
    setCurrentStep(0);
  }, []);

  const start = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const resume = useCallback(() => {
    // Resume from the persisted step (already restored from localStorage on mount)
    setIsActive(true);
  }, []);

  const next = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev >= totalSteps - 1) {
        // Last step — complete the tour
        markCompleted();
        return 0;
      }
      return prev + 1;
    });
  }, [totalSteps, markCompleted]);

  const prev = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const skip = useCallback(() => {
    markCompleted();
  }, [markCompleted]);

  const complete = useCallback(() => {
    markCompleted();
  }, [markCompleted]);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STEP_STORAGE_KEY);
    setIsCompleted(false);
    setCurrentStep(0);
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      if (index >= 0 && index < totalSteps) {
        setCurrentStep(index);
      }
    },
    [totalSteps]
  );

  const skipSection = useCallback(() => {
    // Find the next section and jump to its first step
    const nextSectionIdx = currentSection + 1;
    if (nextSectionIdx < sections.length) {
      setCurrentStep(sections[nextSectionIdx].startIndex);
    } else {
      // No more sections — complete the tour
      markCompleted();
    }
  }, [currentSection, sections, markCompleted]);

  // Listen for custom event to restart tour (from settings page)
  useEffect(() => {
    const handleRestart = () => {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STEP_STORAGE_KEY);
      setIsCompleted(false);
      setCurrentStep(0);
      setIsActive(true);
    };
    window.addEventListener('restart-onboarding-tour', handleRestart);
    return () => window.removeEventListener('restart-onboarding-tour', handleRestart);
  }, []);

  return {
    isActive,
    currentStep,
    totalSteps,
    isCompleted,
    sections,
    currentSection,
    totalSections,
    start,
    resume,
    next,
    prev,
    skip,
    complete,
    reset,
    goToStep,
    skipSection,
  };
}
