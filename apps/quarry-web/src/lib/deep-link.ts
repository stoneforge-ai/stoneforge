/**
 * Deep-Link Navigation Utilities (TB70)
 *
 * Provides utilities for navigating directly to specific elements via URL,
 * calculating correct page positions for paginated lists, and highlighting
 * the target element with a temporary animation.
 */

/**
 * Configuration for deep-link navigation
 */
export interface DeepLinkConfig<T> {
  /** Full dataset (all items) */
  data: T[];
  /** Target element ID to navigate to */
  targetId: string;
  /** Current page size */
  pageSize: number;
  /** Function to extract ID from an item */
  getId: (item: T) => string;
}

/**
 * Result of finding an element's position in a paginated list
 */
export interface DeepLinkResult {
  /** Whether the element was found */
  found: boolean;
  /** Zero-based index of the element in the dataset */
  index: number;
  /** 1-based page number where the element is located */
  page: number;
  /** Zero-based index within the page */
  indexOnPage: number;
}

/**
 * Find the page and position of an element in a dataset
 * @param config Configuration for finding the element
 * @returns Position information or not-found result
 */
export function findElementPosition<T>(config: DeepLinkConfig<T>): DeepLinkResult {
  const { data, targetId, pageSize, getId } = config;

  const index = data.findIndex(item => getId(item) === targetId);

  if (index === -1) {
    return {
      found: false,
      index: -1,
      page: 1,
      indexOnPage: -1,
    };
  }

  // Calculate 1-based page number
  const page = Math.floor(index / pageSize) + 1;

  // Calculate position within the page
  const indexOnPage = index % pageSize;

  return {
    found: true,
    index,
    page,
    indexOnPage,
  };
}

/**
 * Calculate scroll offset for virtualized list
 * @param indexOnPage Zero-based index of item on the current page
 * @param rowHeight Height of each row in pixels
 * @param headerHeight Optional header height to account for (default 0)
 * @returns Scroll offset in pixels
 */
export function calculateScrollOffset(
  indexOnPage: number,
  rowHeight: number,
  headerHeight: number = 0
): number {
  return (indexOnPage * rowHeight) + headerHeight;
}

/**
 * Highlight duration for deep-link navigation (in milliseconds)
 */
export const HIGHLIGHT_DURATION = 2000;

/**
 * CSS class name for the highlight animation
 */
export const HIGHLIGHT_CLASS = 'deep-link-highlight';

/**
 * Apply highlight effect to an element
 * @param element DOM element to highlight
 * @param duration Duration in milliseconds (default: 2000)
 */
export function applyHighlight(element: HTMLElement, duration: number = HIGHLIGHT_DURATION): void {
  element.classList.add(HIGHLIGHT_CLASS);

  // Scroll element into view with smooth behavior
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Remove highlight after duration
  setTimeout(() => {
    element.classList.remove(HIGHLIGHT_CLASS);
  }, duration);
}

/**
 * Find and highlight an element by test ID
 * @param testId The data-testid attribute value
 * @param duration Highlight duration in milliseconds
 * @returns Whether the element was found and highlighted
 */
export function highlightByTestId(testId: string, duration: number = HIGHLIGHT_DURATION): boolean {
  const element = document.querySelector(`[data-testid="${testId}"]`) as HTMLElement;

  if (element) {
    applyHighlight(element, duration);
    return true;
  }

  return false;
}
