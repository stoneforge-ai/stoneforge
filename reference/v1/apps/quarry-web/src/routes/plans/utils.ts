/**
 * Utilities for the Plans page
 * Search, date formatting, and storage helpers
 */

import React from 'react';
import type { ViewMode, FuzzySearchResult } from './types';
import { SEARCH_STORAGE_KEY, VIEW_MODE_STORAGE_KEY } from './constants';

// ============================================================================
// Search Storage
// ============================================================================

export function getStoredSearch(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SEARCH_STORAGE_KEY) || '';
}

export function setStoredSearch(search: string): void {
  if (typeof window === 'undefined') return;
  if (search) {
    localStorage.setItem(SEARCH_STORAGE_KEY, search);
  } else {
    localStorage.removeItem(SEARCH_STORAGE_KEY);
  }
}

// ============================================================================
// View Mode Storage
// ============================================================================

export function getStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'list';
  const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === 'roadmap' ? 'roadmap' : 'list';
}

export function setStoredViewMode(mode: ViewMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
}

// ============================================================================
// Fuzzy Search
// ============================================================================

/**
 * Fuzzy search function that matches query characters in sequence within the title.
 * Returns match info for highlighting if matched, null otherwise.
 */
export function fuzzySearch(title: string, query: string): FuzzySearchResult | null {
  if (!query) return { matched: true, indices: [] };

  const lowerTitle = title.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const indices: number[] = [];
  let queryIdx = 0;

  for (let i = 0; i < lowerTitle.length && queryIdx < lowerQuery.length; i++) {
    if (lowerTitle[i] === lowerQuery[queryIdx]) {
      indices.push(i);
      queryIdx++;
    }
  }

  // All query characters must be found in sequence
  if (queryIdx === lowerQuery.length) {
    return { matched: true, indices };
  }

  return null;
}

/**
 * Highlights matched characters in a title based on match indices.
 */
export function highlightMatches(title: string, indices: number[]): React.ReactNode {
  if (indices.length === 0) {
    return React.createElement(React.Fragment, null, title);
  }

  const result: React.ReactNode[] = [];
  const indexSet = new Set(indices);
  let lastIndex = 0;

  for (let i = 0; i < title.length; i++) {
    if (indexSet.has(i)) {
      // Add text before this match
      if (i > lastIndex) {
        result.push(React.createElement('span', { key: `text-${lastIndex}` }, title.slice(lastIndex, i)));
      }
      // Add highlighted character
      result.push(
        React.createElement('mark', {
          key: `match-${i}`,
          className: 'bg-yellow-200 dark:bg-yellow-700/50 text-gray-900 dark:text-yellow-100 rounded-sm px-0.5',
        }, title[i])
      );
      lastIndex = i + 1;
    }
  }

  // Add remaining text
  if (lastIndex < title.length) {
    result.push(React.createElement('span', { key: `text-${lastIndex}` }, title.slice(lastIndex)));
  }

  return React.createElement(React.Fragment, null, ...result);
}

// ============================================================================
// Date Formatting
// ============================================================================

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}
