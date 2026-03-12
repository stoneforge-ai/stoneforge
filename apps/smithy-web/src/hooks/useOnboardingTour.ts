/**
 * useOnboardingTour - Manages onboarding tour state with localStorage persistence
 *
 * Controls whether the tour should be shown, tracks the current step,
 * and persists completion/skip state so the tour only shows once.
 */

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'stoneforge:onboarding-complete';

export interface OnboardingTourState {
  /** Whether the tour is currently active (visible) */
  isActive: boolean;
  /** Current step index (0-based) */
  currentStep: number;
  /** Total number of steps in the tour */
  totalSteps: number;
  /** Whether the tour has been completed or skipped previously */
  isCompleted: boolean;
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
  /** Reset the tour (clears completion flag for re-access from settings) */
  reset: () => void;
}

/**
 * Hook for managing the onboarding guided tour.
 *
 * @param totalSteps - The total number of steps in the tour
 * @returns Tour state and control functions
 */
export function useOnboardingTour(totalSteps: number): OnboardingTourState {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  const markCompleted = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsCompleted(true);
    setIsActive(false);
    setCurrentStep(0);
  }, []);

  const start = useCallback(() => {
    setCurrentStep(0);
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
    setIsCompleted(false);
    setCurrentStep(0);
  }, []);

  // Listen for custom event to restart tour (from settings page)
  useEffect(() => {
    const handleRestart = () => {
      localStorage.removeItem(STORAGE_KEY);
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
    start,
    next,
    prev,
    skip,
    complete,
    reset,
  };
}
