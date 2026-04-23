/**
 * useDeepLink Hook (TB70)
 *
 * React hook for deep-link navigation. Handles finding elements in paginated
 * data, navigating to the correct page, and highlighting the target element.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  findElementPosition,
  highlightByTestId,
  HIGHLIGHT_DURATION,
} from '../lib/deep-link';

export interface UseDeepLinkOptions<T> {
  /** Full dataset (all items) */
  data: T[] | undefined;
  /** Target element ID from URL (e.g., from search params) */
  selectedId: string | undefined | null;
  /** Current page number (1-based) */
  currentPage: number;
  /** Page size */
  pageSize: number;
  /** Function to extract ID from an item */
  getId: (item: T) => string;
  /** Route path for navigation (e.g., '/tasks') */
  routePath: string;
  /** Test ID prefix for rows (e.g., 'task-row-' → 'task-row-{id}') */
  rowTestIdPrefix: string;
  /** Whether to auto-navigate to correct page if element is on different page */
  autoNavigate?: boolean;
  /** Delay before highlighting (ms) - allows render to complete */
  highlightDelay?: number;
}

export interface UseDeepLinkResult {
  /** Whether the selected element was found in the dataset */
  found: boolean;
  /** Whether we're in the process of navigating to the element */
  isNavigating: boolean;
  /** Whether the element is not found (404 state) */
  notFound: boolean;
  /** Page number where the element is located (1-based) */
  targetPage: number;
  /** Manually trigger navigation to element */
  navigateToElement: (elementId: string) => void;
}

export function useDeepLink<T>(options: UseDeepLinkOptions<T>): UseDeepLinkResult {
  const {
    data,
    selectedId,
    currentPage,
    pageSize,
    getId,
    routePath,
    rowTestIdPrefix,
    autoNavigate = true,
    highlightDelay = 100,
  } = options;

  const navigate = useNavigate();
  const [isNavigating, setIsNavigating] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const hasHighlightedRef = useRef<string | null>(null);

  // Find element position when data is available
  const result = data && selectedId
    ? findElementPosition({
        data,
        targetId: selectedId,
        pageSize,
        getId,
      })
    : { found: false, index: -1, page: 1, indexOnPage: -1 };

  // Handle auto-navigation to correct page and not-found detection
  useEffect(() => {
    if (!data || !selectedId) {
      setNotFound(false);
      return;
    }

    // Reset notFound when selection changes
    setNotFound(false);

    // If not found in data
    if (!result.found) {
      // Set notFound regardless of autoNavigate - if the item doesn't exist, it doesn't exist
      setNotFound(true);
      return;
    }

    // If autoNavigate is enabled and element is on a different page, navigate
    if (autoNavigate && result.page !== currentPage) {
      setIsNavigating(true);
      navigate({
        to: routePath as '/' | '/tasks' | '/plans' | '/workflows' | '/dependencies' | '/messages' | '/documents' | '/entities' | '/teams' | '/settings' | '/dashboard' | '/dashboard/task-flow' | '/dashboard/timeline',
        search: (prev) => ({
          ...prev,
          page: result.page,
          selected: selectedId,
        }),
      });
    } else {
      setIsNavigating(false);
    }
  }, [data, selectedId, result.found, result.page, currentPage, autoNavigate, navigate, routePath]);

  // Highlight the element after navigation completes
  useEffect(() => {
    if (!selectedId || !result.found || isNavigating) {
      return;
    }

    // Don't highlight the same element twice
    if (hasHighlightedRef.current === selectedId) {
      return;
    }

    // Only highlight if we're on the correct page
    if (result.page !== currentPage) {
      return;
    }

    // Delay to allow render to complete
    const timer = setTimeout(() => {
      const testId = `${rowTestIdPrefix}${selectedId}`;
      const highlighted = highlightByTestId(testId, HIGHLIGHT_DURATION);

      if (highlighted) {
        hasHighlightedRef.current = selectedId;
      }
    }, highlightDelay);

    return () => clearTimeout(timer);
  }, [selectedId, result.found, result.page, currentPage, isNavigating, rowTestIdPrefix, highlightDelay]);

  // Reset highlighted ref when selection changes
  useEffect(() => {
    if (!selectedId) {
      hasHighlightedRef.current = null;
    }
  }, [selectedId]);

  // Manual navigation function
  const navigateToElement = useCallback((elementId: string) => {
    if (!data) return;

    const position = findElementPosition({
      data,
      targetId: elementId,
      pageSize,
      getId,
    });

    if (position.found) {
      setIsNavigating(true);
      navigate({
        to: routePath as '/' | '/tasks' | '/plans' | '/workflows' | '/dependencies' | '/messages' | '/documents' | '/entities' | '/teams' | '/settings' | '/dashboard' | '/dashboard/task-flow' | '/dashboard/timeline',
        search: (prev) => ({
          ...prev,
          page: position.page,
          selected: elementId,
        }),
      });
    } else {
      setNotFound(true);
    }
  }, [data, pageSize, getId, navigate, routePath]);

  return {
    found: result.found,
    isNavigating,
    notFound,
    targetPage: result.page,
    navigateToElement,
  };
}
